# Stillroom Image Uploader

A local image uploader with drag-and-drop, click-to-select, and server-side resizing. Resized files are written to `uploads/`.

## Run

```sh
npm install
npm start
```

Open `http://localhost:3000` in a browser. Set `PORT` to use a different port.

## Resize settings

Edit `config/resize.json` to choose the exact output dimensions:

```json
{
  "width": 1200,
  "height": 800
}
```

The server reads the file for each upload, so changes apply without restarting. Images are center-cropped to fill the configured dimensions while preserving the image format. JPG, PNG, and WebP files up to 15 MB are accepted.
# snd-uploader
