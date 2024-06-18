const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const imageMap = new Map();  // Map to store image paths against IDs

app.use(cors());
app.use(express.static('public'));
app.use(express.json());  // Add this line to parse JSON request bodies

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: function (req, file, cb) {
    const imageId = uuidv4();
    cb(null, `${imageId}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage: storage });

app.post('/upload', upload.single('image'), (req, res) => {
  const imageId = path.basename(req.file.filename, path.extname(req.file.filename));
  imageMap.set(imageId, req.file.path);
  res.json({ imageId });
});

app.post('/add-text', async (req, res) => {
  const { imageId, name, dateTime } = req.body;

  const imagePath = imageMap.get(imageId);

  if (!imagePath) {
    return res.status(400).send('Invalid image ID or no image uploaded yet.');
  }

  try {
    const image = await loadImage(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(image, 0, 0, image.width, image.height);

    // Define placeholders and their replacements
    const placeholders = {
      '{name}': name,
      '{date and time}': dateTime
    };

    // Loop through the placeholders and replace them
    let templateText = "Hello, {name}! Today's date and time is {date and time}.";
    for (const [placeholder, replacement] of Object.entries(placeholders)) {
      templateText = templateText.replace(placeholder, replacement);
    }

    // Draw the new text on the canvas
    ctx.font = '24px Arial';  // Default font size and family
    ctx.fillStyle = '#000000'; // Default color
    ctx.fillText(templateText, 50, 100); // Default x, y coordinates

    const outputFileName = `edited-${Date.now()}.jpg`;
    const outputPath = `./uploads/${outputFileName}`;
    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createJPEGStream();

    stream.pipe(out);
    out.on('finish', () => {
      // Return the full URL of the backend server
      const backendUrl = `https://auto-image-generation-backend.onrender.com`; // Replace with your actual backend URL
      res.json({ url: `${backendUrl}/uploads/${outputFileName}` });
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Schedule cleanup task to run daily
cron.schedule('0 0 * * *', () => {
  const directory = './uploads/';
  const maxAge = 7 * 24 * 60 * 60 * 1000;  // 7 days in milliseconds

  fs.readdir(directory, (err, files) => {
    if (err) throw err;

    files.forEach(file => {
      const filePath = path.join(directory, file);
      fs.stat(filePath, (err, stats) => {
        if (err) throw err;

        if (Date.now() - stats.mtimeMs > maxAge) {
          fs.unlink(filePath, err => {
            if (err) throw err;
            console.log(`Deleted old file: ${file}`);
          });
        }
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
