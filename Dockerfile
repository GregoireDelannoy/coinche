FROM node:13

WORKDIR /app

ADD . /app

RUN npm install express deepcopy socket.io

EXPOSE 8003

CMD ["node", "app.js"]