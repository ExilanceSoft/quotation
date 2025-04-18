module.exports = (sequelize, DataTypes) => {
    const VehicleModel = sequelize.define('VehicleModel', {
      name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      model_group: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT
      },
      engine_cc: {
        type: DataTypes.INTEGER
      },
      fuel_type: {
        type: DataTypes.ENUM('Petrol', 'Diesel', 'Electric', 'CNG', 'Hybrid'),
        defaultValue: 'Petrol'
      },
      gearbox: {
        type: DataTypes.ENUM('Manual', 'Automatic', 'CVT', 'DCT'),
        defaultValue: 'Manual'
      },
      image_url: {
        type: DataTypes.STRING(255)
      },
      color_options: {
        type: DataTypes.JSON
      },
      ex_showroom_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      rto_tax_percentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false
      },
      default_insurance: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      pdi_handling: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 1000.00
      },
      hpa_charges: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 500.00
      },
      mandatory_fitments: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00
      }
    }, {
      tableName: 'vehicle_models',
      timestamps: true,
      underscored: true
    });
  
    VehicleModel.associate = function(models) {
      VehicleModel.hasMany(models.ModelAccessory, {
        foreignKey: 'model_id',
        as: 'accessories'
      });
      VehicleModel.hasMany(models.QuotationItem, {
        foreignKey: 'model_id',
        as: 'quotations'
      });
    };
  
    return VehicleModel;
  };