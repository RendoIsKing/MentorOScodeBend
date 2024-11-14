import express from "express";
import path from "path";
import fs from "fs";

const router = express.Router();

router.get("/download/:userId/:fileName", (req, res) => {
  const { userId, fileName } = req.params;
  const filePath = path.join(__dirname, `../app/temp/${userId}/${fileName}`);
  //@ts-ignore
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error("File not found:", err);
      return res.status(404).json({ error: { message: "File not found" } });
    }

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("Error downloading file:", err);
        res.status(500).json({
          error: { message: "Something went wrong while downloading file" },
        });
      } else {
        console.log("File successfully downloaded:", fileName);
      }
    });
  });
});

export default router;
