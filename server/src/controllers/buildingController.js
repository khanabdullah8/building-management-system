const mongoose = require('mongoose');
const Building = require('../models/Building');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { hasGlobalAccess, isBuildingAllowed } = require('../utils/scope');

const getBuildings = asyncHandler(async (req, res) => {
  const { search, status } = req.query;
  const { buildingIds } = req.scope;
  const filter = {};

  if (buildingIds !== null) {
    if (!buildingIds || buildingIds.length === 0) {
      return sendSuccess(res, []);
    }
    filter._id = { $in: buildingIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  if (status) {
    filter.status = status;
  }

  if (search) {
    const searchRegex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { code: searchRegex },
      { name: searchRegex },
      { address: searchRegex },
    ];
  }

  const buildings = await Building.find(filter).sort({ createdAt: -1 });

  return sendSuccess(res, buildings);
});

const getBuildingById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Building not found');
  }

  const building = await Building.findById(id);

  if (!building) {
    throw new ApiError(404, 'Building not found');
  }

  if (!isBuildingAllowed(req.scope.buildingIds, building._id)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  return sendSuccess(res, building);
});

const createBuilding = asyncHandler(async (req, res) => {
  if (!hasGlobalAccess(req.scope.buildingIds)) {
    throw new ApiError(403, 'Forbidden: only admins can create buildings');
  }

  const { code, name, address, units, status } = req.body;

  if (!code || typeof code !== 'string' || !code.trim()) {
    throw new ApiError(400, 'Building code is required', { code: 'Building code is required' });
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new ApiError(400, 'Building name is required', { name: 'Building name is required' });
  }

  if (units !== undefined && (typeof units !== 'number' || units < 0)) {
    throw new ApiError(400, 'Units must be a non-negative number', { units: 'Units must be a non-negative number' });
  }

  if (status !== undefined && !['active', 'inactive'].includes(status)) {
    throw new ApiError(400, 'Status must be active or inactive', { status: 'Status must be active or inactive' });
  }

  try {
    const building = await Building.create({
      code: code.trim(),
      name: name.trim(),
      address: address ? address.trim() : '',
      units: units !== undefined ? units : 0,
      status: status || 'active',
    });

    return sendSuccess(res, building, 'Building created successfully', null, 201);
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, `Building with code '${code.trim().toUpperCase()}' already exists`, {
        code: 'Building code must be unique',
      });
    }
    throw error;
  }
});

const updateBuilding = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Building not found');
  }

  const building = await Building.findById(id);
  if (!building) {
    throw new ApiError(404, 'Building not found');
  }

  if (!isBuildingAllowed(req.scope.buildingIds, building._id)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  const { code, name, address, units, status } = req.body;

  if (code !== undefined) {
    if (typeof code !== 'string' || !code.trim()) {
      throw new ApiError(400, 'Building code cannot be empty', { code: 'Building code cannot be empty' });
    }
    building.code = code.trim();
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new ApiError(400, 'Building name cannot be empty', { name: 'Building name cannot be empty' });
    }
    building.name = name.trim();
  }

  if (address !== undefined) {
    building.address = typeof address === 'string' ? address.trim() : '';
  }

  if (units !== undefined) {
    if (typeof units !== 'number' || units < 0) {
      throw new ApiError(400, 'Units must be a non-negative number', { units: 'Units must be a non-negative number' });
    }
    building.units = units;
  }

  if (status !== undefined) {
    if (!['active', 'inactive'].includes(status)) {
      throw new ApiError(400, 'Status must be active or inactive', { status: 'Status must be active or inactive' });
    }
    building.status = status;
  }

  try {
    const updatedBuilding = await building.save();
    return sendSuccess(res, updatedBuilding, 'Building updated successfully');
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, `Building with code '${code ? code.trim().toUpperCase() : ''}' already exists`, {
        code: 'Building code must be unique',
      });
    }
    throw error;
  }
});

const deleteBuilding = asyncHandler(async (req, res) => {
  if (!hasGlobalAccess(req.scope.buildingIds)) {
    throw new ApiError(403, 'Forbidden: only admins can delete buildings');
  }

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Building not found');
  }

  const building = await Building.findByIdAndDelete(id);

  if (!building) {
    throw new ApiError(404, 'Building not found');
  }

  return sendSuccess(res, null, 'Building deleted successfully');
});

module.exports = {
  getBuildings,
  getBuildingById,
  createBuilding,
  updateBuilding,
  deleteBuilding,
};
