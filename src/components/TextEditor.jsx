export default function TextEditor({ text, onChange, loading }) {
  return (
    <div className="text-editor">
      <label htmlFor="extracted-text">النص المستخرج</label>
      {loading ? (
        <div className="loading">جاري استخراج النص...</div>
      ) : (
        <textarea
          id="extracted-text"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          dir="rtl"
          lang="ar"
          placeholder="سيظهر النص المستخرج هنا..."
          rows={15}
        />
      )}
    </div>
  );
}
