import { useState } from "react";

export default function ImportRepositoryModal({
  isOpen,
  onClose,
  onImport,
  loading,
}) {
  const [githubUrl, setGithubUrl] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!githubUrl.trim()) return;

    const parts = githubUrl.split("/");
    const name = parts[parts.length - 1];

    onImport({
      name,
      githubUrl,
    });

    setGithubUrl("");
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-2xl font-bold mb-2">
          Import Repository
        </h2>

        <p className="text-gray-500 mb-6">
          Enter a GitHub repository URL.
        </p>

        <input
          type="text"
          placeholder="https://github.com/user/repository"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          className="w-full border rounded-lg px-4 py-3"
        />

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="border px-4 py-2 rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg disabled:opacity-50"
          >
            {loading ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}