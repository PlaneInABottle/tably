# Tably Store Assets

Store-ready media and draft listing copy for Tably 1.0.0 (`com.tably.app`).

## Folders

- `raw/iphone-17-pro-max/`: all captured product states at 1320 x 2868.
- `app-store/iphone-6.9/`: ordered set of 10 opaque PNG screenshots for App Store Connect.
- `google-play/phone/`: ordered set of 8 opaque 1080 x 1920 phone screenshots.
- `google-play/listing/`: 512 x 512 app icon and 1024 x 500 feature graphic.
- `video/app-preview-iphone-6.9.mp4`: 20-second, 886 x 1920, 30 fps H.264/AAC App Store preview.
- `video/google-play-preview-landscape.mp4`: 20-second, 1920 x 1080 H.264/AAC source for YouTube.
- `metadata/`: listing copy, screenshot captions, reviewer notes, and release checklist.

The Play preview must be uploaded to YouTube as public or unlisted before its URL can be added to the listing. Reviewer credentials are intentionally not stored in Git.

Specifications checked on July 12, 2026:

- Apple screenshots: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Apple previews: https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications
- Google Play graphics: https://support.google.com/googleplay/android-developer/answer/9866151
