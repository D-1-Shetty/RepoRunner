import { useEffect, useState } from "react";

import {
  getRepositoryEnv,
  updateRepositoryEnv,
} from "../../api/repository.api";

// Same rule the backend uses for clone / deployment / PUT /env.
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

let rowSeq = 0;
const makeRow = (overrides = {}) => ({
  id: `env-row-${(rowSeq += 1)}`,
  key: "",
  value: "", // never holds a value returned by the backend
  secret: true,
  hadValue: false,
  isNew: true,
  clear: false, // existing rows only: request removal of the stored value
  ...overrides,
});

export default function EnvironmentPanel({ repositoryId }) {
  const [rows, setRows] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  // Rebuilds the form from a backend response. The backend never returns
  // values, so every value input is reset to empty.
  const seedFromServer = (data) => {
    setRows(
      (data?.env ?? []).map((entry) =>
        makeRow({
          key: entry.key,
          value: "",
          secret: Boolean(entry.secret),
          hadValue: Boolean(entry.hasValue),
          isNew: false,
        })
      )
    );
    setUpdatedAt(data?.updatedAt ?? null);
  };

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await getRepositoryEnv(repositoryId);
      seedFromServer(data);
    } catch (error) {
      // Log a value-free message only - never the error object (its
      // request config can contain the submitted values).
      console.error(
        "Failed to load environment configuration:",
        error?.response?.data?.message ?? error?.message ?? "unknown error"
      );
      setLoadError("Could not load environment configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryId]);

  const patchRow = (id, patch) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
    setSaveError("");
    setSavedMessage("");
  };

  const addRow = () => {
    setRows((prev) => [...prev, makeRow()]);
    setSaveError("");
    setSavedMessage("");
  };

  const removeRow = (id) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
    setSaveError("");
    setSavedMessage("");
  };

  const keyCounts = rows.reduce((counts, row) => {
    const key = row.key.trim();
    if (key) counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  // Returns a validation message (keys only, never values) or "" when valid.
  const validate = () => {
    const seen = new Set();

    for (const row of rows) {
      const key = row.key.trim();

      if (!KEY_PATTERN.test(key)) {
        return `Invalid variable name: "${key || "(empty)"}"`;
      }
      if (seen.has(key)) {
        return `Duplicate variable name: "${key}"`;
      }
      seen.add(key);

      if (row.isNew && row.value === "") {
        return `"${key}" needs a value.`;
      }
    }

    return "";
  };

  const save = async () => {
    const validationError = validate();
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setSaving(true);
    setSaveError("");
    setSavedMessage("");

    try {
      const env = rows.map((row) => {
        const key = row.key.trim();

        // New variable: always send its typed value (validated non-empty).
        if (row.isNew) {
          return { key, value: row.value, secret: row.secret };
        }

        // Existing variable, "Clear value" selected: remove the stored value.
        if (row.clear) {
          return { key, value: "", secret: row.secret };
        }

        // Existing variable, a new value typed: replace it.
        if (row.value !== "") {
          return { key, value: row.value, secret: row.secret };
        }

        // Existing variable, value left blank: keep the current value.
        return { key, keep: true, secret: row.secret };
      });

      const data = await updateRepositoryEnv(repositoryId, env);
      seedFromServer(data); // values cleared again, hadValue refreshed
      setSavedMessage("Environment configuration saved.");
    } catch (error) {
      console.error(
        "Failed to save environment configuration:",
        error?.response?.data?.message ?? error?.message ?? "unknown error"
      );
      setSaveError("Could not save environment configuration.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="text-gray-500 text-sm">
        Loading environment configuration…
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="text-sm">
        <p className="text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={load}
          className="mt-2 text-blue-600 hover:text-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="text-sm text-gray-500 mb-4 space-y-1">
        <p>
          Environment configuration for the repository's backend applications.
        </p>
        <ul className="list-disc list-inside">
          <li>Leave a value blank to keep the current value.</li>
          <li>
            Use <span className="font-medium">Clear value</span> to remove a
            variable's stored value (the variable stays).
          </li>
          <li>Remove a row to delete the environment variable entirely.</li>
        </ul>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          No environment variables configured.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const trimmedKey = row.key.trim();
            const keyInvalid =
              trimmedKey !== "" && !KEY_PATTERN.test(trimmedKey);
            const isDuplicate =
              trimmedKey !== "" && keyCounts[trimmedKey] > 1;

            return (
              <div
                key={row.id}
                className="border rounded-lg p-4 flex flex-col md:flex-row md:items-start gap-3"
              >
                <div className="md:w-1/3">
                  {row.isNew ? (
                    <input
                      type="text"
                      placeholder="VARIABLE_NAME"
                      value={row.key}
                      disabled={saving}
                      onChange={(e) =>
                        patchRow(row.id, { key: e.target.value })
                      }
                      className="w-full border rounded-lg px-3 py-2 font-mono text-sm"
                    />
                  ) : (
                    <p className="font-mono text-sm font-medium break-all">
                      {row.key}
                    </p>
                  )}

                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={row.secret}
                        disabled={saving}
                        onChange={(e) =>
                          patchRow(row.id, { secret: e.target.checked })
                        }
                      />
                      Secret
                    </label>
                    <span>
                      {row.hadValue ? "Value configured" : "No value"}
                    </span>
                    {!row.isNew && (
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={row.clear}
                          disabled={saving}
                          onChange={(e) =>
                            patchRow(row.id, {
                              clear: e.target.checked,
                              value: e.target.checked ? "" : row.value,
                            })
                          }
                        />
                        Clear value
                      </label>
                    )}
                  </div>
                </div>

                <div className="flex-1">
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      row.clear
                        ? "Value will be removed on save"
                        : row.isNew
                        ? "Value"
                        : row.hadValue
                        ? "Leave blank to keep the current value"
                        : "Value"
                    }
                    value={row.value}
                    disabled={saving || row.clear}
                    onChange={(e) =>
                      patchRow(row.id, { value: e.target.value })
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
                  />

                  {keyInvalid && (
                    <p className="mt-1 text-xs text-red-600">
                      Use letters, digits and underscores; don't start with a
                      digit.
                    </p>
                  )}
                  {isDuplicate && (
                    <p className="mt-1 text-xs text-red-600">
                      Duplicate variable name.
                    </p>
                  )}
                  {row.isNew && row.value === "" && (
                    <p className="mt-1 text-xs text-gray-400">
                      New variables require a value.
                    </p>
                  )}
                  {row.clear && (
                    <p className="mt-1 text-xs text-amber-600">
                      The stored value will be removed on save.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  disabled={saving}
                  aria-label="Remove variable"
                  className="px-2 py-2 text-gray-400 hover:text-red-600 self-start"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        disabled={saving}
        className="mt-3 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
      >
        + Add Environment Variable
      </button>

      {saveError && (
        <p className="mt-4 text-sm text-red-600">{saveError}</p>
      )}
      {savedMessage && (
        <p className="mt-4 text-sm text-green-600">{savedMessage}</p>
      )}

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Configuration"}
        </button>

        {updatedAt && (
          <span className="text-xs text-gray-400">
            Last updated {new Date(updatedAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
