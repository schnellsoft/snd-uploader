const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");

const app = express();
const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const uploadDirectory = path.join(root, "uploads");
const configPath = path.join(root, "config", "resize.json");
const allowedFormats = new Set(["jpeg", "png", "webp"]);

const maxFiles = 20;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: maxFiles },
  fileFilter(_request, file, callback) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      callback(new Error("Choose a JPG, PNG, or WebP image."));
      return;
    }
    callback(null, true);
  },
});

async function getResizeOptions() {
  const options = JSON.parse(await fs.readFile(configPath, "utf8"));
  const validDimension = (value) =>
    Number.isInteger(value) && value > 0 && value <= 10000;

  if (!validDimension(options.width) || !validDimension(options.height)) {
    throw new Error(
      "Resize dimensions must be whole numbers between 1 and 10000.",
    );
  }

  return { width: options.width, height: options.height };
}

app.use(express.static(path.join(root, "public")));
app.use("/uploads", express.static(uploadDirectory, { fallthrough: false }));

app.get("/api/config", async (_request, response, next) => {
  try {
    response.json(await getResizeOptions());
  } catch (error) {
    next(error);
  }
});

app.get("/api/uploads", async (_request, response, next) => {
  try {
    const names = await fs.readdir(uploadDirectory);
    const files = await Promise.all(
      names
        .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
        .map(async (name) => {
          const stats = await fs.stat(path.join(uploadDirectory, name));
          return {
            name,
            url: `/uploads/${encodeURIComponent(name)}`,
            createdAt: stats.mtimeMs,
          };
        }),
    );

    files.sort((first, second) => second.createdAt - first.createdAt);
    response.json(files);
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/upload",
  upload.fields([
    { name: "images", maxCount: maxFiles },
    { name: "image", maxCount: maxFiles },
  ]),
  async (request, response, next) => {
    try {
      const uploaded = request.files || {};
      const files = [...(uploaded.images || []), ...(uploaded.image || [])];
      if (files.length === 0) {
        response.status(400).json({ error: "Choose at least one image." });
        return;
      }

      const dimensions = await getResizeOptions();
      const saved = [];

      for (const file of files) {
        const image = sharp(file.buffer, {
          limitInputPixels: 100_000_000,
        });
        const metadata = await image.metadata();

        if (!allowedFormats.has(metadata.format)) {
          response
            .status(415)
            .json({ error: `${file.originalname} is not a supported image.` });
          return;
        }

        const extension = metadata.format === "jpeg" ? "jpg" : metadata.format;
        const name = `${crypto.randomUUID()}.${extension}`;
        const outputPath = path.join(uploadDirectory, name);

        await image
          .rotate()
          .resize(dimensions.width, dimensions.height, {
            fit: "cover",
            position: "centre",
          })
          .toFile(outputPath);

        saved.push({
          name,
          url: `/uploads/${name}`,
          width: dimensions.width,
          height: dimensions.height,
        });
      }

      response.status(201).json({
        files: saved,
        width: dimensions.width,
        height: dimensions.height,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    console.error("Upload rejected:", error.code, error.message);
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Each image must be 15 MB or smaller."
        : error.code === "LIMIT_FILE_COUNT" ||
            error.code === "LIMIT_UNEXPECTED_FILE"
          ? `You can upload up to ${maxFiles} images at once.`
          : "Could not accept those files.";
    response.status(400).json({ error: message });
    return;
  }

  if (
    error.message === "This image format is not supported." ||
    error.message.startsWith("Input")
  ) {
    response
      .status(415)
      .json({ error: "The selected file is not a supported image." });
    return;
  }

  if (
    error.message ===
    "Resize dimensions must be whole numbers between 1 and 10000."
  ) {
    response.status(500).json({ error: error.message });
    return;
  }

  if (error.message === "Choose a JPG, PNG, or WebP image.") {
    response.status(400).json({ error: error.message });
    return;
  }

  console.error(error);
  response
    .status(500)
    .json({ error: "Something went wrong while processing the image." });
});

fs.mkdir(uploadDirectory, { recursive: true })
  .then(() =>
    app.listen(port, () => {
      console.log(`Image uploader ready at http://localhost:${port}`);
    }),
  )
  .catch((error) => {
    console.error("Could not create the uploads directory.", error);
    process.exitCode = 1;
  });
