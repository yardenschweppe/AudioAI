# Plugin Assets Instructions

## Plugin Icon (Required)

WordPress automatically looks for plugin icons in the **plugin root directory**. Place your logo file with one of these names:

### Recommended Sizes:
- **`icon-256x256.png`** - Main icon (256x256 pixels) - **RECOMMENDED**
- **`icon-128x128.png`** - Fallback icon (128x128 pixels)
- **`icon.svg`** - SVG icon (if you want scalable icon)

### Location:
```
audio-press-ai/
├── icon-256x256.png  ← Place your logo here
├── icon-128x128.png  ← Optional fallback
└── audio-press-ai.php
```

### Specifications:
- **Format**: PNG (recommended) or SVG
- **Size**: 256x256 pixels (for PNG)
- **Background**: Transparent or solid color
- **Design**: Should be clear and recognizable at small sizes

## Plugin Banner (Optional)

For the plugin details page, you can also add a banner:

### Recommended Sizes:
- **`banner-772x250.png`** - Standard banner (772x250 pixels) - **RECOMMENDED**
- **`banner-1544x500.png`** - High-resolution banner (1544x500 pixels)

### Location:
```
audio-press-ai/
├── banner-772x250.png  ← Place your banner here
└── audio-press-ai.php
```

### Specifications:
- **Format**: PNG or JPG
- **Size**: 772x250 pixels (minimum), 1544x500 pixels (retina)
- **Aspect Ratio**: Approximately 3:1 (width:height)
- **Content**: Should include plugin name and key features

## Freemius Icon (If using Freemius)

If you're using Freemius SDK, you can also set an icon through:
- Freemius Developer Dashboard
- Or place icon in `wordpress-sdk-master/assets/img/plugin-icon.png`

## Quick Setup Steps:

1. **Prepare your logo**:
   - Create a 256x256 PNG file with transparent background
   - Make sure it's clear and recognizable
   - Name it `icon-256x256.png`

2. **Place the file**:
   - Copy `icon-256x256.png` to the plugin root directory (`/audio-press-ai/`)
   - Same directory as `audio-press-ai.php`

3. **Clear WordPress cache** (if needed):
   - WordPress should automatically detect the icon
   - If not visible, try:
     - Deactivate and reactivate the plugin
     - Clear any caching plugins

4. **Verify**:
   - Go to **Plugins** → **Installed Plugins**
   - You should see your icon next to "Audio-Press AI"

## Notes:
- The icon will appear in:
  - Plugins list in WordPress admin
  - Plugin details page
  - Some plugin update screens
- Make sure the file permissions allow WordPress to read the file
- Use PNG format for best compatibility
- Keep file size reasonable (under 50KB recommended)

