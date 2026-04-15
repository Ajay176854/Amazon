import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Multer configuration for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Zod schema for invoice validation
const InvoiceSchema = z.object({
  id: z.string().min(1, "Invoice ID is required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  amount: z.coerce.number().positive("Amount must be a positive number"),
  customer: z.string().min(1, "Customer name is required"),
  state: z.string().min(1, "State is required"),
  type: z.enum(['B2B', 'B2C'], { message: "Type must be B2B or B2C" }),
  items: z.coerce.number().int().positive("Items must be a positive integer"),
});

app.use(express.json());

// API Routes
app.post('/api/upload', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const fileContent = file.buffer.toString();
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const results = {
      valid: [] as any[],
      errors: [] as { row: number; errors: string[] }[]
    };

    records.forEach((record: any, index: number) => {
      const validation = InvoiceSchema.safeParse(record);
      if (validation.success) {
        results.valid.push(validation.data);
      } else {
        results.errors.push({
          row: index + 2, // +1 for 0-index, +1 for header row
          errors: validation.error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
        });
      }
    });

    if (results.errors.length > 0) {
      return res.status(422).json({
        message: 'Validation failed for some rows',
        errors: results.errors,
        validCount: results.valid.length
      });
    }

    res.json({
      message: 'File processed successfully',
      count: results.valid.length,
      data: results.valid
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
