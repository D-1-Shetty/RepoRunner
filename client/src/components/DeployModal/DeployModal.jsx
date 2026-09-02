import { useState } from "react";

// Valid POSIX-ish environment variable name.
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const emptyRow = () => ({ key: "", value: "" });

export default function DeployModal({
  isOpen,
  repositoryName,
  loading = false,
  onClose,
  onDeploy,
}) {
  const [rows, setRows] = useState([emptyRow()]);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const updateRow = (index, field, value) => {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      )
    );
    setError("");
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow()]);
  };

  const removeRow = (index) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [emptyRow()];
    });
    setError("");
  };

  const handleDeploy = () => {
    // Rows where nothing was typed at all are simply ignored.
    const filledRows = rows.filter(
      (row) => row.key.trim() !== "" || row.value.trim() !== ""
    );

    const env = {};

    for (const row of filledRows) {
      const key = row.key.trim();

      if (!key) {
        setError("Every environment variable needs a name.");
        return;
      }

      if (!KEY_PATTERN.test(key)) {
        setError(
          `"${key}" is not a valid name. Use letters, digits and underscores, and don't start with a digit.`
        );
        return;
      }

      if (Object.prototype.hasOwnProperty.call(env, key)) {
        setError(`"${key}" is listed more than once.`);
        return;
      }

      env[key] = row.value;
    }

    onDeploy(env);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-2xl font-bold mb-2">
          Deploy {repositoryName}
        </h2>

        <p className="text-gray-500 mb-6">
          Add environment variables for the backend container. Leave the
          list empty to deploy without any.
        </p>

        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {rows.map((row, index) => (
            <div key={index} className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="MONGO_URI"
                value={row.key}
                onChange={(e) =>
                  updateRow(index, "key", e.target.value)
                }
                className="flex-1 border rounded-lg px-3 py-2 font-mono text-sm"
              />

              <input
                type="password"
                placeholder="<your MongoDB connection string>"
                value={row.value}
                autoComplete="new-password"
                onChange={(e) =>
                  updateRow(index, "value", e.target.value)
                }
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />

              <button
                type="button"
                onClick={() => removeRow(index)}
                aria-label="Remove variable"
                className="px-2 py-2 text-gray-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-3 text-sm text-blue-600 hover:text-blue-700"
        >
          + Add Environment Variable
        </button>

        <div className="mt-3 text-xs text-gray-400 font-mono leading-relaxed">
          <div>{"MONGO_URI = <your MongoDB connection string>"}</div>
          <div>{"JWT_SECRET = <your JWT secret>"}</div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="border px-4 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            onClick={handleDeploy}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg disabled:opacity-50"
          >
            {loading ? "Deploying..." : "Deploy"}
          </button>
        </div>
      </div>
    </div>
  );
}
