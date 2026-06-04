# SafeCheck Expo App

This is a minimal Expo / React Native rebuild of the SafeCheck frontend based on the existing SafeCheck HTML UI and the deployed AWS backend routes. It preserves the core product flow from the uploaded frontend and backend files: scan, inventory, community, and points. fileciteturn0file0 fileciteturn0file2

## What it does
- Login and register against the deployed Cognito-backed Lambda routes
- Scan by manually entering a barcode or product name
- Add scan results to inventory
- Load and delete inventory items
- Load community posts
- Create community posts
- Load points and rewards

## What it does not do yet
- Camera barcode scanning
- Rich report form on Android (uses `Alert.prompt`, which is iOS-only)
- Voting and redemption routes, because the simplified backend does not expose those in the final flow

## Run it
1. `npm install`
2. `npx expo start`
3. Open with Expo Go

## Backend URL
The app currently points to:
- `https://b7mshalko4.execute-api.us-east-1.amazonaws.com/dev`

Change `API_BASE` in `App.js` if needed.
