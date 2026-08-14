import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class PdfRenderUnavailableError extends Error {
  constructor(message = "PDF rendering is not available on this server.") {
    super(message);
    this.name = "PdfRenderUnavailableError";
  }
}

export async function renderTexToPdf(tex: string) {
  const workDir = await mkdtemp(path.join(tmpdir(), "cvhelp-pdf-"));
  const texPath = path.join(workDir, "artifact.tex");
  const pdfPath = path.join(workDir, "artifact.pdf");

  try {
    await writeFile(texPath, tex, "utf8");
    await execFileAsync("tectonic", ["--outdir", workDir, texPath], {
      cwd: workDir,
      timeout: 20_000,
      maxBuffer: 1024 * 1024 * 4
    });

    return await readFile(pdfPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      throw new PdfRenderUnavailableError("Install tectonic on the server to enable PDF previews.");
    }

    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
