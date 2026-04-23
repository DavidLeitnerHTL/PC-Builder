/**
 * PC Builder 2026 - Build Storage Module
 * Handles saving, loading, and managing PC build configurations
 * Uses localStorage for persistence with JSON export/import support
 */

const STORAGE_KEY = 'pcbuilder_saved_builds';
const MAX_BUILDS = 10; // Maximum number of saved builds per user

/**
 * BuildStorage - Main module for managing saved PC builds
 */
const BuildStorage = {

    /**
     * Get all saved builds from localStorage
     * @returns {Array} Array of saved build objects
     */
    getAllBuilds() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Error reading builds from localStorage:', e);
            return [];
        }
    },

    /**
     * Save a new build configuration
     * @param {string} name - Name for the build
     * @param {Object} components - Object containing selected components
     * @param {number} totalPrice - Total price of the build
     * @returns {Object} Result object with success status and build data or error
     */
    saveBuild(name, components, totalPrice) {
        try {
            // Validate inputs
            if (!name || name.trim() === '') {
                return { success: false, error: 'Bitte gib einen Namen für den Build ein.' };
            }

            const builds = this.getAllBuilds();

            // Check if max builds reached
            if (builds.length >= MAX_BUILDS) {
                return {
                    success: false,
                    error: `Maximal ${MAX_BUILDS} Builds können gespeichert werden. Bitte lösche einen alten Build.`
                };
            }

            // Check for duplicate names
            if (builds.some(b => b.name.toLowerCase() === name.trim().toLowerCase())) {
                return { success: false, error: 'Ein Build mit diesem Namen existiert bereits.' };
            }

            // Create build object
            const build = {
                id: this._generateId(),
                name: name.trim(),
                createdAt: new Date().toISOString(),
                totalPrice: totalPrice,
                components: components
            };

            // Add to builds array and save
            builds.push(build);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(builds));

            return { success: true, build: build };
        } catch (e) {
            console.error('Error saving build:', e);
            return { success: false, error: 'Fehler beim Speichern des Builds.' };
        }
    },

    /**
     * Load a specific build by ID
     * @param {string} buildId - The ID of the build to load
     * @returns {Object} Result object with success status and build data or error
     */
    loadBuild(buildId) {
        try {
            const builds = this.getAllBuilds();
            const build = builds.find(b => b.id === buildId);

            if (!build) {
                return { success: false, error: 'Build nicht gefunden.' };
            }

            return { success: true, build: build };
        } catch (e) {
            console.error('Error loading build:', e);
            return { success: false, error: 'Fehler beim Laden des Builds.' };
        }
    },

    /**
     * Delete a build by ID
     * @param {string} buildId - The ID of the build to delete
     * @returns {Object} Result object with success status or error
     */
    deleteBuild(buildId) {
        try {
            let builds = this.getAllBuilds();
            const initialLength = builds.length;

            builds = builds.filter(b => b.id !== buildId);

            if (builds.length === initialLength) {
                return { success: false, error: 'Build nicht gefunden.' };
            }

            localStorage.setItem(STORAGE_KEY, JSON.stringify(builds));
            return { success: true };
        } catch (e) {
            console.error('Error deleting build:', e);
            return { success: false, error: 'Fehler beim Löschen des Builds.' };
        }
    },

    /**
     * Export a build to JSON string for sharing
     * @param {string} buildId - The ID of the build to export
     * @returns {Object} Result object with success status and JSON string or error
     */
    exportBuild(buildId) {
        try {
            const result = this.loadBuild(buildId);
            if (!result.success) {
                return result;
            }

            // Create export object with metadata
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                application: 'PC Builder 2026',
                build: result.build
            };

            return {
                success: true,
                json: JSON.stringify(exportData, null, 2),
                filename: `pc-build-${result.build.name.replace(/\s+/g, '-').toLowerCase()}.json`
            };
        } catch (e) {
            console.error('Error exporting build:', e);
            return { success: false, error: 'Fehler beim Exportieren des Builds.' };
        }
    },

    /**
     * Import a build from JSON string
     * @param {string} jsonString - The JSON string to import
     * @returns {Object} Result object with success status and build data or error
     */
    importBuild(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            // Validate structure
            if (!data.build || !data.build.name || !data.build.components) {
                return { success: false, error: 'Ungültiges Build-Format.' };
            }

            // Check if it's from PC Builder
            if (data.application !== 'PC Builder 2026') {
                console.warn('Importing build from unknown source:', data.application);
            }

            // Create new build with fresh ID and timestamp
            const builds = this.getAllBuilds();

            // Check if max builds reached
            if (builds.length >= MAX_BUILDS) {
                return {
                    success: false,
                    error: `Maximal ${MAX_BUILDS} Builds können gespeichert werden. Bitte lösche einen alten Build.`
                };
            }

            // Handle name conflicts by appending a number
            let name = data.build.name;
            let counter = 1;
            while (builds.some(b => b.name.toLowerCase() === name.toLowerCase())) {
                name = `${data.build.name} (${counter})`;
                counter++;
            }

            const build = {
                id: this._generateId(),
                name: name,
                createdAt: new Date().toISOString(),
                totalPrice: data.build.totalPrice || 0,
                components: data.build.components
            };

            builds.push(build);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(builds));

            return { success: true, build: build };
        } catch (e) {
            console.error('Error importing build:', e);
            return { success: false, error: 'Fehler beim Importieren des Builds. Ungültiges JSON-Format.' };
        }
    },

    /**
     * Update an existing build (e.g., after modifying components)
     * @param {string} buildId - The ID of the build to update
     * @param {Object} updates - Object with updated properties
     * @returns {Object} Result object with success status and build data or error
     */
    updateBuild(buildId, updates) {
        try {
            const builds = this.getAllBuilds();
            const index = builds.findIndex(b => b.id === buildId);

            if (index === -1) {
                return { success: false, error: 'Build nicht gefunden.' };
            }

            // Update allowed fields
            if (updates.name) {
                // Check for name conflicts (excluding current build)
                const otherBuild = builds.find((b, i) =>
                    i !== index && b.name.toLowerCase() === updates.name.trim().toLowerCase()
                );
                if (otherBuild) {
                    return { success: false, error: 'Ein Build mit diesem Namen existiert bereits.' };
                }
                builds[index].name = updates.name.trim();
            }

            if (updates.components) {
                builds[index].components = updates.components;
            }

            if (updates.totalPrice !== undefined) {
                builds[index].totalPrice = updates.totalPrice;
            }

            builds[index].updatedAt = new Date().toISOString();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(builds));

            return { success: true, build: builds[index] };
        } catch (e) {
            console.error('Error updating build:', e);
            return { success: false, error: 'Fehler beim Aktualisieren des Builds.' };
        }
    },

    /**
     * Get the count of saved builds
     * @returns {number} Number of saved builds
     */
    getBuildCount() {
        return this.getAllBuilds().length;
    },

    /**
     * Clear all saved builds (use with caution!)
     * @returns {Object} Result object with success status
     */
    clearAllBuilds() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            return { success: true };
        } catch (e) {
            console.error('Error clearing builds:', e);
            return { success: false, error: 'Fehler beim Löschen aller Builds.' };
        }
    },

    /**
     * Generate a unique ID for builds
     * @returns {string} Unique identifier
     * @private
     */
    _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
};

// Make available globally
window.BuildStorage = BuildStorage;