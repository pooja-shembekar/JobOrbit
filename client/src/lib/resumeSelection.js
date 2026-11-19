export const clearResumeSelection = (fileInput) => {
  if (fileInput) fileInput.value = '';
  return null;
};