const extractSeriesFromName = (modelName) => {
    // Extract series name (first word before space)
    const seriesMatch = modelName.match(/^([^\s]+)/);
    return seriesMatch ? seriesMatch[1] : 'OTHER';
  };
  
  const getBaseModelForSeries = async (Model, series) => {
    const baseModel = await Model.aggregate([
      {
        $match: { model_series: series }
      },
      {
        $lookup: {
          from: 'headers',
          localField: 'prices.header_id',
          foreignField: '_id',
          as: 'headers'
        }
      },
      {
        $unwind: '$prices'
      },
      {
        $unwind: '$headers'
      },
      {
        $match: {
          'headers.header_key': 'Ex-Showroom'
        }
      },
      {
        $sort: { 'prices.value': 1 }
      },
      {
        $limit: 1
      },
      {
        $project: {
          _id: 1,
          model_name: 1,
          'prices.value': 1
        }
      }
    ]);
  
    return baseModel.length > 0 ? baseModel[0] : null;
  };
  
  module.exports = {
    extractSeriesFromName,
    getBaseModelForSeries
  };