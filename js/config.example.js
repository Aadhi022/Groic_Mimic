/**
 * GROIC - Configuration Template & Developer Guide
 * 
 * INSTRUCTIONS:
 * 1. Copy this file to `config.js` in the same directory (`js/config.js`).
 * 2. Add your personal YouTube Data API v3 key below if you wish to use live search.
 * 3. Add your Supabase URL and public anon key below for Realtime Social Rooms,
 *    Authentication, and Cloud Library synchronization.
 * 4. Never commit private backend service-role keys or database passwords here.
 *    Only public/restricted client-side keys belong in static browser code.
 * 
 * SUPABASE REALTIME & SOCIAL SETUP:
 * - Go to https://supabase.com and create a project.
 * - In SQL Editor, run `supabase/schema.sql` to create tables and atomic functions.
 * - Go to Project Settings -> API to copy Project URL and Project API Key (anon/public).
 * - Paste them into SUPABASE_URL and SUPABASE_ANON_KEY below or configure via in-app Settings modal.
 * 
 * YOUTUBE API KEY SETUP & SECURITY:
 * - Go to Google Cloud Console (https://console.cloud.google.com/)
 * - Create a project and enable "YouTube Data API v3"
 * - Under "Application restrictions": Select "Websites" (HTTP referrers)
 *   and add your local development URL (e.g. `http://localhost:*`) and GitHub Pages URL.
 * - Under "API restrictions": Select ONLY "YouTube Data API v3".
 */

window.GROIC_CONFIG = {
  // YouTube Data API v3 Key (Leave empty to use Demo Mode)
  YOUTUBE_API_KEY: '',

  // Force Demo Mode even if an API key is configured
  FORCE_DEMO_MODE: false,

  // Default query when opening the Explore page
  DEFAULT_SEARCH_GENRE: 'trending sounds',

  // Number of search results to fetch per page
  MAX_RESULTS_PER_PAGE: 12,

  // Supabase Cloud Configuration (Required for Realtime Social Rooms & Auth)
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  // App Metadata
  APP_NAME: 'GROIC',
  APP_TAGLINE: 'Create a Room. Invite Your People. Listen Together.',
  VERSION: '2.0.0'
};
