export default function FileUploader({ onFileSelect, onTextFileSelect }) {
  const handleChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.endsWith('.txt') || file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = () => onTextFileSelect(reader.result, file.name);
      reader.readAsText(file, 'utf-8');
    } else {
      onFileSelect(file);
    }
  };

  return (
    <div className="file-uploader">
      <label htmlFor="file-input" className="upload-label">
        اختر ملف PDF أو صورة أو ملف نصي (.txt)
      </label>
      <input
        id="file-input"
        type="file"
        accept=".pdf,.txt,text/plain,image/*"
        onChange={handleChange}
      />
    </div>
  );
}
