import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import { exec } from "child_process";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_API_KEY = process.env.WORKER_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Simple API key auth
app.use((req, res, next) => {
  if (req.headers.authorization !== `Bearer ${WORKER_API_KEY}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.post("/render", async (req, res) => {
  const { source_url, output_path } = req.body;

  if (!source_url || !output_path) {
    return res.status(400).json({ error: "Missing source_url or output_path" });
  }

  try {
    const inputFile = "/tmp/input.wav";
    const outputFile = "/tmp/output.wav";

    // Download source WAV
    const response = await fetch(source_url);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(inputFile, Buffer.from(buffer));

    // Minimal ffmpeg processing (proof-of-life)
    const ffmpegCmd = `
      ffmpeg -y -i ${inputFile} \
      -af "highpass=f=30,lowpass=f=18000" \
      ${outputFile}
    `;

    await new Promise((resolve, reject) => {
      exec(ffmpegCmd, (err) => (err ? reject(err) : resolve()));
    });

    // Upload processed file
    const processedBuffer = fs.readFileSync(outputFile);
    const { error } = await supabase.storage
      .from("audio")
      .upload(output_path, processedBuffer, {
        contentType: "audio/wav",
        upsert: true
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from("audio")
      .getPublicUrl(output_path);

    res.json({ processed_url: data.publicUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`metal-mix-worker running on port ${PORT}`);
});
