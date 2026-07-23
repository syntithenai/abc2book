import { GOOGLE_DRIVE_FILE_SCOPE } from './googleDrivePickerClient'

// Identity scopes for resolver auth and user profile.
export const GOOGLE_IDENTITY_SCOPES = ['openid', 'email', 'profile'];

// Default sign-in: identity + Drive files this app creates/opens (one consent screen).
export const GOOGLE_LOGIN_SCOPES = GOOGLE_IDENTITY_SCOPES.concat([GOOGLE_DRIVE_FILE_SCOPE]);
