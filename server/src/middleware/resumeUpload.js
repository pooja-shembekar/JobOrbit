import path from 'node:path';
import multer from 'multer';

const acceptedTypes = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);

export const uploadResume = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (acceptedTypes.get(extension) !== file.mimetype) {
      const error = new Error('Resume must be a PDF or DOCX file.');
      error.code = 'INVALID_RESUME_TYPE';
      return callback(error);
    }
    callback(null, true);
  },
}).single('resume');