import { useEffect, useState } from "react";

import DashboardLayout from "../layouts/DashboardLayout";
import StatsCard from "../components/StatsCard/StatsCard";
import RepositoryCard from "../components/RepositoryCard/RepositoryCard";
import ConfirmModal from "../components/ConfirmModal/ConfirmModal";
import ImportRepositoryModal from "../components/ImportRepositoryModal/ImportRepositoryModal";

import {
  getRepositories,
  deleteRepository,
  importRepository,
} from "../api/repository.api";

import { getDashboardStats } from "../api/dashboard.api";

export default function Dashboard() {
  const [repositories, setRepositories] = useState([]);

  const [stats, setStats] = useState({
    repositories: 0,
    deployments: 0,
    runningApps: 0,
    successRate: 0,
  });

  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRepository, setSelectedRepository] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [repoData, statsData] = await Promise.all([
        getRepositories(),
        getDashboardStats(),
      ]);

      setRepositories(repoData.repositories);
      setStats(statsData.stats);
    } catch (error) {
      console.error(error);
    }
  };

  const handleImport = async (repositoryData) => {
    try {
      setImporting(true);

      await importRepository(repositoryData);

      await fetchDashboardData();

      setShowImportModal(false);
    } catch (error) {
      console.error(error);

      alert(
        error.response?.data?.message || "Import failed"
      );
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = (repositoryId) => {
    setSelectedRepository(repositoryId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedRepository) return;

    try {
      setDeleting(true);

      await deleteRepository(selectedRepository);

      setRepositories((prev) =>
        prev.filter(
          (repo) => repo._id !== selectedRepository
        )
      );

      const statsData = await getDashboardStats();
      setStats(statsData.stats);

      setShowDeleteModal(false);
      setSelectedRepository(null);
    } catch (error) {
      console.error(error);

      alert(
        error.response?.data?.message ||
          "Failed to delete repository"
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">
          Dashboard
        </h1>

        <button
          onClick={() => setShowImportModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg transition"
        >
          + Import Repository
        </button>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <StatsCard
          title="Repositories"
          value={stats.repositories}
          color="border-blue-500"
        />

        <StatsCard
          title="Deployments"
          value={stats.deployments}
          color="border-green-500"
        />

        <StatsCard
          title="Running Apps"
          value={stats.runningApps}
          color="border-yellow-500"
        />

        <StatsCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          color="border-purple-500"
        />
      </div>

      <div className="mt-10">
        <h2 className="text-2xl font-bold mb-6">
          Repositories
        </h2>

        <div className="space-y-4">
          {repositories.length > 0 ? (
            repositories.map((repository) => (
              <RepositoryCard
                key={repository._id}
                repository={repository}
                onDelete={handleDelete}
              />
            ))
          ) : (
            <p className="text-gray-500">
              No repositories found.
            </p>
          )}
        </div>
      </div>

      <ImportRepositoryModal
        isOpen={showImportModal}
        loading={importing}
        onClose={() => {
          setShowImportModal(false);
        }}
        onImport={handleImport}
      />

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Repository"
        message="Are you sure you want to delete this repository? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteModal(false);
          setSelectedRepository(null);
        }}
      />
    </DashboardLayout>
  );
}