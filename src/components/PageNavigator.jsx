export default function PageNavigator({
  currentPage,
  totalPages,
  onPageChange,
  loading,
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="page-navigator">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 0 || loading}
      >
        السابق
      </button>
      <span>
        صفحة {currentPage + 1} من {totalPages}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages - 1 || loading}
      >
        التالي
      </button>
    </div>
  );
}
