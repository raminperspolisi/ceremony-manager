// src/styles.jsx
export const styles = {
  container: {
    backgroundColor: '#d4d0c8',
    border: '2px solid #808080',
    padding: '2px',
    fontFamily: 'Tahoma, sans-serif',
    fontSize: '12px',
    color: '#000'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    border: '1px solid #000',
    backgroundColor: '#fff'
  },
  headerCell: {
    backgroundColor: '#000080',
    color: '#fff',
    padding: '4px',
    textAlign: 'center',
    fontWeight: 'bold',
    border: '1px solid #808080'
  },
  cell: {
    border: '1px solid #808080',
    padding: '2px',
    textAlign: 'center'
  }
};

// تابع فرمت کردن اعداد به صورت پول با کاما
export const formatDisplay = (num) => {
  if (!num && num !== 0) return '۰';
  return Number(num).toLocaleString('fa-IR');
};
