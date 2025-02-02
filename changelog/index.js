import { generateChangelog } from "./changelog.js";
import { createWriteStream } from "fs";
const outputStream = createWriteStream("CHANGELOG.md");
generateChangelog({}, outputStream);
