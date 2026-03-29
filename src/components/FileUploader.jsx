export default function FileUploader({ onFileSelect }) {
  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file) onFileSelect(file);
  };

  return (
    <div className="file-uploader">
      <label htmlFor="file-input" className="upload-label">
        📄 اختر ملف PDF أو صورة
      </label>
      <input
        id="file-input"
        type="file"
        accept=".pdf,image/*"
        onChange={handleChange}
      />
    </div>
  );
}
