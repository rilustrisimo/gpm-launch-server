const { 
  Campaign, 
  Template, 
  ContactList, 
  Contact, 
  CampaignStat,
  sequelize 
} = require('../models');
const { Op } = require('sequelize');

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    // Get total campaigns
    const totalCampaigns = await Campaign.count({
      where: { userId: req.user.id }
    });

    // Get active subscribers
    const activeSubscribers = await Contact.count({
      where: { status: 'active' },
      include: [
        {
          model: ContactList,
          as: 'lists',
          where: { userId: req.user.id },
          through: { attributes: [] }
        }
      ],
      distinct: true
    });

    // Get total templates
    const totalTemplates = await Template.count({
      where: { userId: req.user.id }
    });

    // Get delivered emails
    const deliveredEmails = await CampaignStat.count({
      where: { delivered: true },
      include: [
        {
          model: Campaign,
          as: 'campaign',
          where: { userId: req.user.id }
        }
      ]
    });

    // Get recent campaigns
    const recentCampaigns = await Campaign.findAll({
      where: { userId: req.user.id },
      limit: 5,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'name', 'status', 'sentAt', 'openRate']
    });

    return res.status(200).json({
      success: true,
      stats: {
        totalCampaigns,
        activeSubscribers,
        totalTemplates,
        deliveredEmails
      },
      recentCampaigns
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving dashboard statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get campaign performance statistics
exports.getCampaignStats = async (req, res) => {
  try {
    const campaigns = await Campaign.findAll({
      where: { 
        userId: req.user.id,
        status: 'completed'
      },
      attributes: [
        'id', 'name', 'sentAt', 'totalRecipients', 'openRate', 'clickRate'
      ],
      order: [['sentAt', 'DESC']],
      limit: 5
    });

    // Calculate overall stats
    const overallStats = await Campaign.findAll({
      where: { 
        userId: req.user.id,
        status: 'completed'
      },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('totalRecipients')), 'totalSent'],
        [sequelize.fn('AVG', sequelize.col('openRate')), 'avgOpenRate'],
        [sequelize.fn('AVG', sequelize.col('clickRate')), 'avgClickRate']
      ],
      raw: true
    });

    return res.status(200).json({
      success: true,
      campaigns,
      overall: {
        totalSent: parseInt(overallStats[0].totalSent) || 0,
        avgOpenRate: parseFloat(overallStats[0].avgOpenRate) || 0,
        avgClickRate: parseFloat(overallStats[0].avgClickRate) || 0
      }
    });
  } catch (error) {
    console.error('Get campaign stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving campaign statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get contact growth statistics
exports.getContactGrowthStats = async (req, res) => {
  try {
    // Get contact count by month for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const contactGrowth = await Contact.findAll({
      where: {
        createdAt: {
          [Op.gte]: sixMonthsAgo
        }
      },
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'month'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      include: [
        {
          model: ContactList,
          as: 'lists',
          where: { userId: req.user.id },
          through: { attributes: [] },
          attributes: []
        }
      ],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m')],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'ASC']],
      raw: true
    });

    // Get contact status distribution
    const contactStatus = await Contact.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      include: [
        {
          model: ContactList,
          as: 'lists',
          where: { userId: req.user.id },
          through: { attributes: [] },
          attributes: []
        }
      ],
      group: ['status'],
      raw: true
    });

    return res.status(200).json({
      success: true,
      growth: contactGrowth,
      status: contactStatus
    });
  } catch (error) {
    console.error('Get contact growth stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving contact growth statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 