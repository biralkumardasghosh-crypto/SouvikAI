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
