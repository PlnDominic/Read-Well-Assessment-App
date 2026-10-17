import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * The font for text in Twi, Ga or Ewe (a summary's family note): the PDFs'
 * built-in Helvetica has no ɛ, ɔ, ŋ, ɖ, ƒ, ɣ or ʋ, so those letters would
 * come out blank. DejaVu Sans has them all (fonts/LICENSE.txt). Read from
 * disk when a PDF needs it; next.config.ts ships the files with the server.
 */
export const LOCAL_LANGUAGE_FONT = "DejaVu Sans";

const dir = path.join(process.cwd(), "src/lib/pdf/fonts");
Font.register({
  family: LOCAL_LANGUAGE_FONT,
  fonts: [
    { src: path.join(dir, "DejaVuSans.ttf") },
    { src: path.join(dir, "DejaVuSans-Bold.ttf"), fontWeight: 700 },
  ],
});
