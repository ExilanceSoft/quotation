// utils/initializeRoles.js
const Role = require('../models/Role');
const logger = require('../config/logger');

const initializeRoles = async () => {
  const defaultRoles = [
    {
      name: 'admin',
      description: 'Branch administrator with management privileges',
      permissions: [
        { resource: 'user', actions: ['create', 'read', 'update'] },
        { resource: 'branch', actions: ['read'] },
        { resource: 'model', actions: ['manage'] },
        { resource: 'accessory', actions: ['manage'] },
        { resource: 'quotation', actions: ['manage'] }
      ],
      is_default: true
    },
    {
      name: 'manager',
      description: 'Branch manager with limited management privileges',
      permissions: [
        { resource: 'user', actions: ['read'] },
        { resource: 'branch', actions: ['read'] },
        { resource: 'model', actions: ['read'] },
        { resource: 'accessory', actions: ['read'] },
        { resource: 'quotation', actions: ['manage'] }
      ],
      is_default: true
    },
    {
      name: 'sales',
      description: 'Sales representative with basic access',
      permissions: [
        { resource: 'branch', actions: ['read'] },
        { resource: 'model', actions: ['read'] },
        { resource: 'accessory', actions: ['read'] },
        { resource: 'quotation', actions: ['create', 'read'] }
      ],
      is_default: true
    }
  ];

  for (const roleData of defaultRoles) {
    await Role.findOneAndUpdate(
      { name: roleData.name },
      roleData,
      { upsert: true, new: true }
    );
  }
  logger.info('Default roles initialized');
};

module.exports = initializeRoles;