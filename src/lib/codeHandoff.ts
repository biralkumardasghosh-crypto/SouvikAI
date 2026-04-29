/**
 * Storage key used to hand off the model the user picked on the /code
 * landing composer to the freshly created workspace. The workspace
 * page reads this once on mount, applies it via `setSelectedModelId`,
 * then clears the key so it doesn't leak to the next build.
 */
export const CODE_NEXT_MODEL_KEY = 'code:nextModel';
