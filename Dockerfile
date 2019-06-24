FROM node

ADD . /market
WORKDIR /market
RUN node installer.js

CMD ["node", "index.js"]
