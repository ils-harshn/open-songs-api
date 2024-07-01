require("dotenv").config();
const songs = require("./songs");
const allowIPs = require("./allowIPs");
const serverless = require('serverless-http');

const express = require("express");
const bodyParser = require("body-parser");
const requestIp = require("request-ip");
const cors = require("cors");

const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;
const SRC_URI = process.env.SRC_URI;
const PASSKEY = process.env.PASSKEY;

var corsOptions = {
  // origin: ["https://adminking123.github.io"],
  origin: "*",
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
// Middleware to extract IP address from request
app.use(requestIp.mw());
app.use(bodyParser.json());

const allowAccessOnlyToAllowedIp = (req, res, next) => {
  const clientIp = req.clientIp;
  if (allowIPs[clientIp]) {
    next();
  } else {
    res.status(403).send({ status: "not allowed" });
  }
};

app.get("/status", allowAccessOnlyToAllowedIp, async (req, res) => {
  res.json({
    status: "working",
    songs_length: songs.length,
  });
});

app.get("/images/*", async (req, res) => {
  const imagePath = encodeURIComponent(req.params[0]);
  const url = `${SRC_URI}/${imagePath}`;

  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });

    res.setHeader("Content-Type", response.headers["content-type"]);

    response.data.pipe(res);
  } catch (error) {
    console.error(error);
    if (error.response && error.response.status === 404) {
      res.status(404).send("Image not found");
    } else {
      res.status(500).send("Server Error");
    }
  }
});

app.get("/songs/*", allowAccessOnlyToAllowedIp, async (req, res) => {
  const songPath = encodeURIComponent(req.params[0]);
  const url = `${SRC_URI}/${songPath}`;

  try {
    const range = req.headers.range;
    if (!range) {
      return res.status(416).send("Range header required");
    }

    const headResponse = await axios.head(url);
    const fileSize = headResponse.headers["content-length"];

    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      return res.status(416).send("Requested range not satisfiable");
    }

    const contentLength = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": contentLength,
      "Content-Type": "audio/mpeg",
    });

    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
      headers: {
        Range: `bytes=${start}-${end}`,
      },
    });

    response.data.pipe(res);
  } catch (error) {
    res.status(500).send("Server Error");
  }
});

app.get("/list/songs", allowAccessOnlyToAllowedIp, async (req, res) => {
  const query = req.query.query || "";

  res.json({
    songs: songs
      .filter(function (songObj) {
        const song = songObj;
        const searchString = `${song.original_name} ${song.album.title} ${
          song.album.year
        } ${song.genre.name} ${song.artists
          .map((artist) => artist.name)
          .join(" ")}`.toLowerCase();
        return searchString.includes(query.toLowerCase());
      })
      .slice(0, 25),
  });
});

app.get("/get/song/:index", allowAccessOnlyToAllowedIp, async (req, res) => {
  const { index } = req.params;

  if (index >= 0 && index < songs.length) {
    res.json({
      song: songs[index || 0],
    });
  } else {
    res.status(404).json({
      message: "Song not found",
    });
  }
});

app.post("/addIp", (req, res) => {
  const { passKey, name, ip } = req.body;

  if (!passKey || !name || !ip) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (passKey === PASSKEY) {
    allowIPs[ip] = name;
    res.json({ passKey, name, ip });
  } else {
    res.status(403).json({ message: "Passkey is wrong!" });
  }
});

app.get("/get-ip", (req, res) => {
  res.json({ ip: req.clientIp });
});

// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });

module.exports.handler = serverless(app);
