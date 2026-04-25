-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    suspended_until TIMESTAMP WITH TIME ZONE,
    suspension_reason TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    deletion_reason TEXT,
    is_kicked BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat sessions table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT DEFAULT 'New Chat',
    is_pinned BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration: add columns to existing chat_sessions table (safe to run multiple times)
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Requests log table for analytics
CREATE TABLE IF NOT EXISTS public.requests_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'aborted'))
);

-- Admin settings table
CREATE TABLE IF NOT EXISTS public.admin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
    max_tokens INTEGER DEFAULT 2048 CHECK (max_tokens >= 100 AND max_tokens <= 4096),
    model_name TEXT DEFAULT 'meta/llama-3.1-8b-instruct',
    edit_mode BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default admin settings
INSERT INTO public.admin_settings (id, temperature, max_tokens, model_name, edit_mode)
VALUES (1, 0.7, 2048, 'meta/llama-3.1-8b-instruct', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Row Level Security Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Chat sessions policies
CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own chat sessions" ON public.chat_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat sessions" ON public.chat_sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat sessions" ON public.chat_sessions
    FOR DELETE USING (auth.uid() = user_id);

-- Chat messages policies
CREATE POLICY "Users can view own chat messages" ON public.chat_messages
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own chat messages" ON public.chat_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Requests log policies
CREATE POLICY "Users can view own requests" ON public.requests_log
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own requests" ON public.requests_log
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin settings policies
CREATE POLICY "Anyone can read admin settings" ON public.admin_settings
    FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to update admin settings
CREATE POLICY "Authenticated users can update admin settings" ON public.admin_settings
    FOR UPDATE TO authenticated USING (true);

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON public.chat_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_admin_settings_updated_at
    BEFORE UPDATE ON public.admin_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── Token quota tracking ──────────────────────────────────────────────────────
-- Stores per-request token usage for rolling 5-hour quota windows
CREATE TABLE IF NOT EXISTS public.token_usage (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    model_id    TEXT NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast rolling-window queries
CREATE INDEX IF NOT EXISTS idx_token_usage_user_model_time
    ON public.token_usage (user_id, model_id, created_at);

-- Grant access to authenticated users (RLS)
ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can read their own token usage"
    ON public.token_usage FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Service role can insert token usage"
    ON public.token_usage FOR INSERT
    WITH CHECK (true);

-- ── Dynamic Models ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.models (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    is_suspended    BOOLEAN DEFAULT FALSE,
    quota_limit     INTEGER NOT NULL DEFAULT 500000,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Initial Models (matching the previous hardcoded values)
INSERT INTO public.models (id, name, display_name, quota_limit) VALUES 
('souvik-ai-1', 'qwen/qwen3.5-122b-a10b', 'Velocity 1', 500000),
('souvik-ai-1-pro', 'minimaxai/minimax-m2.5', 'Velocity 1.5', 300000)
ON CONFLICT (id) DO NOTHING;

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_models_updated_at
    BEFORE UPDATE ON public.models
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

-- Policies for public.models
CREATE POLICY "Anyone can read models" ON public.models
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage models" ON public.models
    FOR ALL TO authenticated USING (true);

-- Ensure requests_log has the model_id column for RPM tracking (if not already added)
ALTER TABLE public.requests_log ADD COLUMN IF NOT EXISTS model_id TEXT;

-- ── Enforce Single Sign-In Method ─────────────────────────────────────────────
-- Prevent users from linking multiple identity providers (e.g., Email + Google)
-- If they signed up with email, they cannot sign in with Google, and vice versa.
CREATE OR REPLACE FUNCTION public.check_single_provider()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the user already has an identity with a DIFFERENT provider
    IF EXISTS (
        SELECT 1 FROM auth.identities 
        WHERE user_id = NEW.user_id 
        AND provider != NEW.provider
    ) THEN
        RAISE EXCEPTION 'You already have an account with a different sign-in method. Please use your original method to sign in.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_single_provider_trigger ON auth.identities;
CREATE TRIGGER enforce_single_provider_trigger
    BEFORE INSERT ON auth.identities
    FOR EACH ROW EXECUTE FUNCTION public.check_single_provider();
