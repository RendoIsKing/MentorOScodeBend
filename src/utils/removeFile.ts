const fs = require("fs");
import { FileEnum } from "../types/FileEnum";
// @ts-ignore
import path from "path";
export function DeleteFile(filePath: String): Boolean {
  try {
    if (
      fs.existsSync(
        path.join(`${process.cwd()}${FileEnum.PUBLICDIR}${filePath}`)
      )
    ) {
      fs.unlinkSync(
        path.join(`${process.cwd()}${FileEnum.PUBLICDIR}${filePath}`)
      );
      return true;
    } else {
      return true;
    }
  } catch (err) {
    console.error(err, "Error while removing file");
    return false;
  }
}
