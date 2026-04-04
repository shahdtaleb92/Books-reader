import { useState } from 'react';

export default function PageNavigator({
  currentPage,
  totalPages,
  onPageChange,
  loading,
}) {
  const [jumpValue, setJumpValue] = useState('');

  if (totalPages <= 1) return null;

  const handleJump = () => {
    const page = parseInt(jumpValue) - 1;
    if (page >= 0 && page < totalPages && page !== currentPage) {
      onPageChange(page);
    }
    setJumpValue('');
  };

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

      <div className="page-jump">
        <input
          type="number"
          min="1"
          max={totalPages}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJump()}
          placeholder="انتقل"
          disabled={loading}
        />
        <button onClick={handleJump} disabled={loading || !jumpValue}>
          ←
        </button>
      </div>
    </div>
  );
}
