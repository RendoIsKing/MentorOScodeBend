import { Request, Response } from "express";
import { findMany, Tables } from "../../../../lib/db";
import { UserInterface } from "../../../../types/UserInterface";
import archiver from "archiver";
import fs from "fs";
import path from "path";
import fsExtra from "fs-extra";

const FILE_CHUNK_SIZE =
  parseInt(process.env.FILE_CHUNK_SIZE || "50") * 1024 * 1024;

export const downloadUserData = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const user = req.user as UserInterface;
    const userId = (user as any).id || user.id;
    const userData: any = await findMany(Tables.USER_DATA, { user_id: userId });

    if (!userData) {
      return res
        .status(404)
        .json({ error: { message: "User Data not found" } });
    }

    let fileData: string;
    let fileName: string;

    if (req.body.fileFormat === "text") {
      fileData = JSON.stringify(userData, null, 2);
      fileName = "userData.txt";
    } else {
      fileData = JSON.stringify(userData);
      fileName = "userData.json";
    }
    const tempDir = path.join(__dirname, "../../../temp", userId);
    fsExtra.ensureDirSync(tempDir);

    const zipFilePath = path.join(tempDir, "userData.zip");
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    archive.pipe(output);
    archive.append(fileData, { name: fileName });

    await archive.finalize();

    const fileStats = fs.statSync(zipFilePath);
    if (fileStats.size > FILE_CHUNK_SIZE) {
      Math.ceil(fileStats.size / FILE_CHUNK_SIZE);
      const chunkFiles: string[] = [];
      const readStream = fs.createReadStream(zipFilePath, {
        highWaterMark: FILE_CHUNK_SIZE,
      });
      let chunkIndex = 0;

      for await (const chunk of readStream) {
        const chunkFilePath = path.join(
          tempDir,
          `userData.part${chunkIndex + 1}.zip`
        );
        fs.writeFileSync(chunkFilePath, chunk);
        chunkFiles.push(chunkFilePath);
        chunkIndex++;
      }

      const downloadLinks = chunkFiles.map((file, index) => ({
        part: index + 1,
        // link: `${req.protocol}://${req.get(
        //   "host"
        // )}/download/${userId}/userData.part${index + 1}.zip`,
        link: `/download/${userId}/userData.part${index + 1}.zip`,
      }));

      return res.json({
        message: "User data ready for download",
        downloadLinks,
      });
    } else {
      // const downloadLink = `${req.protocol}://${req.get(
      //   "host"
      // )}/download/${userId}/userData.zip`;
      const downloadLink = `/download/${userId}/userData.zip`;

      return res.json({
        message: "User data ready for download",
        downloadLink,
      });
    }
  } catch (error) {
    console.log("Error while downloading user data", error);
    res.status(500).json({ error: { message: "Something went wrong" } });
  }
};

