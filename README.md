# DiNo

DiNo is a Vietnamese-language audio library for music and audiobooks, built with Next.js and Capacitor.

## Run locally

Requires Node.js 22+.

```powershell
npm install
npm run dev
```

Open http://localhost:3000.

## Supabase setup

Shared Google sign-in, library metadata, and private audio storage use Supabase. The Firebase project created earlier is no longer used for the database or file storage. Its Firestore database can remain unused; do not create or enable Firebase Storage.

1. Create a Supabase project on a plan that meets your needs.
2. In Project Settings → API, copy the **Project URL** and the **publishable key** (or legacy `anon` key).
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. These client-side values are public; **never** put a Supabase `service_role` or secret key in this app.
4. In Supabase Authentication → Providers, configure Google. In Google Cloud Console, use a Web OAuth client, set the Supabase callback URL shown by Supabase as an authorized redirect URI, and enter that client's ID and secret in the Supabase Google provider settings.
5. In Supabase Authentication → URL Configuration, set the local Site URL to `http://localhost:3000` and allow that URL plus the deployed website origin. Do not add a wildcard redirect.
6. Deploy the database schema and RLS/storage policies:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
   npx supabase db push
   ```

   The migrations create the private audio bucket, shared library, row-level policies, playback statistics, and realtime publication. Alternatively, run `20261028000000_dino_shared_audio.sql`, `20261030000000_dino_home_collections_and_plays.sql`, `20261101000000_dino_albums_and_charts.sql`, `20261102000000_dino_user_audio_actions.sql`, and `20261103000000_dino_admin_only_audio_uploads.sql` in that order.

7. Restart `npm run dev`, then sign in using `xuanduy.cn@gmail.com`. From the profile menu, invite family members by their exact Gmail address. They must use the invited address to sign in.

The admin email is enforced in Postgres RLS: invited users can read shared audio, but only `xuanduy.cn@gmail.com` can add or delete audio. Other members can contact the admin from the app to request new music or books. New uploads are limited to 50 MB. Storage is private and files are fetched through the signed-in Supabase client. Review Supabase's current free-tier storage, transfer, inactivity, and file-size limits in its dashboard; DiNo does not enable automatic billing.

### Adding music and audiobooks

- DiNo stores and plays completed audio files; it does not generate music, synthesize speech, clone voices, or record books.
- Only the admin can upload a finished music or audiobook file. Enter its title and artist/author/reader, choose a file, and optionally assign topic shelves. Other members can contact the admin to request an addition.
- Shared audio is stored privately in Supabase Storage. Only invited accounts can access it, and database/storage policies restrict uploads and deletion to the admin. Keep uploads within the configured 50 MB limit.
- Open **Cài đặt ứng dụng** from the profile avatar to manage data saving, playback defaults, and browser notifications. These preferences stay on the current device; notifications require browser permission and an invited account signed in to the shared library.

### Android Google sign-in

The Android app uses Firebase's native Google sign-in plugin only to obtain a Google ID token; Supabase exchanges that token for the app session. Firebase Firestore and Firebase Storage are not used.

1. In Google Cloud Console, make sure the Web OAuth client ID used by the Supabase Google provider is also the client ID used as the Google **Web client ID** for the Firebase/native sign-in project.
2. Register an Android app with package ID `com.dino.audio` in Firebase Project settings. Add the SHA-1 for the debug signing certificate. To print it:

   ```powershell
   .\android\gradlew.bat -p .\android signingReport
   ```

3. Keep Google sign-in enabled in the Firebase Authentication provider, download `google-services.json`, and put it at `android\app\google-services.json`. It is ignored by Git.
4. Rebuild/sync the app after setting `.env.local`:

   ```powershell
   npm run android:sync
   ```

5. Open `android/` in Android Studio and run it on a device/emulator, or build `assembleDebug` to create the debug APK.

For Vercel, add both `NEXT_PUBLIC_SUPABASE_*` values to the project's environment variables and add the deployed website origin to Supabase's allowed redirect URLs before rebuilding.

## Build Android

Requirements: Node.js 22+, Android Studio, Android SDK, and JDK 21 (recommended for this project's Gradle wrapper). Select JDK 21 under Android Studio → Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK.

```bash
npm install
npm run android:sync
npm run android:open
```

In Android Studio, wait for Gradle sync and press **Run**. To create a debug APK, use **Build > Build Bundle(s) / APK(s) > Build APK(s)**. After changing the web app, run `npm run android:sync` again before rebuilding.

Android uses `@mediagrid/capacitor-native-audio` with a Media3 foreground media service for background playback and system media controls. The Android manifest already declares the service and playback permissions. Private Supabase audio is streamed with a signed URL valid for 24 hours; the URL is kept in memory and is not saved to the library metadata. Build and install the Android app to use the native player. The sample library has no playable files, so verify playback using an uploaded audio item on a device.

## MVP scope and limitations

- Browse/filter/search the sample library. The illustrative sample entries do not contain playable audio.
- Sign in with Google on the web or native Android when Supabase, Google OAuth, and the Android Google config are set up.
- Invited users can listen to shared audio and use personal library features; only `xuanduy.cn@gmail.com` can upload or delete shared items. Upload restrictions are enforced by Supabase RLS and Storage policies as well as the app UI.
- The home page groups shared audio into recommendation shelves. Uploaders can tag items for sleep, relaxation, or fairy-tale shelves, and owners or the admin can update tags on existing items. Shared play counts update at most once per user per item per minute.
- The admin can create music/book albums and manually ordered music/book charts from shared library items. These lists sync in real time and are visible to signed-in invited users; database policies and the creation function restrict writes to the admin.
- Each shared song or audiobook has a three-dot menu for details, downloads, favorites, personal-library saves, Web Share/Zalo/Facebook links, private playlists, and the playback queue. Downloads use authenticated access to private storage and save the audio file under its item title. Favorites, saved items, and playlists sync to the signed-in user's devices; the playback queue is session-only. Public owner details show a display name only; email addresses are never exposed. Shared audio links require an invited DiNo account to play.
- Without Supabase environment settings, local audio remains playable only for the current page/app session.
- Android audio continues when the app is minimized or the screen is locked, with playback controls in the system media notification. Force-stopping the app may stop playback. Audiobook bookmarks, playback speed, and sleep timer are not implemented.
