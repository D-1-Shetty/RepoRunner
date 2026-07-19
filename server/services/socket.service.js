let io = null;

export const setSocketIO = (socketInstance) => {
  io = socketInstance;
};

export const getSocketIO = () => {
  if (!io) {
    throw new Error("Socket.IO has not been initialized.");
  }

  return io;
};