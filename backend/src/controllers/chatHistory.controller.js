const Chat = require('../models/Chat');
const { asyncHandler } = require('../utils/apiError');

// GET /api/chats/:userId?farmId=&page=&limit=
const listChats = asyncHandler(async (req, res) => {
  const { userId } = req.validatedParams;
  const { page, limit, farmId } = req.validatedQuery;

  const filter = { userId };
  if (farmId) filter.farmId = farmId;

  const [items, total] = await Promise.all([
    Chat.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v'),
    Chat.countDocuments(filter),
  ]);

  res.json({
    success: true,
    chats: items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

module.exports = { listChats };
