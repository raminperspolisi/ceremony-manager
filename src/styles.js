const fontFamily = '"IRANSans", "IRANSansX", sans-serif';

export const styles = {
  card: {
    backgroundColor: "#ffffff",
    padding: "25px",
    borderRadius: "15px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    marginBottom: "20px",
    border: "1px solid #e2e8f0",
    fontFamily,
  },
  input: {
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    fontFamily,
    boxSizing: "border-box",
  },
  button: {
    padding: "12px 20px",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
    fontWeight: "bold",
    transition: "background 0.3s",
    fontFamily,
  },
  primaryBtn: {
    backgroundColor: "#3b82f6",
    color: "white",
    fontFamily,
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: "0 8px",
    marginTop: "20px",
    fontFamily,
  },
  th: {
    padding: "15px",
    backgroundColor: "#f1f5f9",
    color: "#475569",
    fontWeight: "bold",
    textAlign: "right",
    fontFamily,
  },
  td: {
    padding: "15px",
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #f1f5f9",
    color: "#334155",
    fontFamily,
  },
  tableWrapper: {
    overflowX: "auto",
    width: "100%",
    WebkitOverflowScrolling: "touch",
    marginTop: "20px",
  },
};

export const formatDisplay = (num) => {
  if (num === null || num === undefined || num === "") return "۰";
  const value = Number(num);
  if (!Number.isFinite(value)) return "۰";
  return new Intl.NumberFormat("fa-IR").format(value);
};
