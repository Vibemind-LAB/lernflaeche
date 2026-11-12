# Abgleichdienst der Lernflaeche. Build-Kontext: dieses Verzeichnis (abgleich/).
FROM node:22.19-alpine
WORKDIR /app
RUN echo '{"name":"abgleich","private":true,"type":"module","dependencies":{"ws":"^8.21.3"}}' > package.json \
 && npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY ausweis.mjs dienst.mjs png-alpha.mjs protokoll.mjs speicher.mjs ./
RUN mkdir -p /daten && chown node:node /daten
ENV ABGLEICH_HOST=0.0.0.0 \
    ABGLEICH_PORT=8160 \
    ABGLEICH_DB=/daten/abgleich.sqlite
VOLUME /daten
USER node
EXPOSE 8160
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8160/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "dienst.mjs"]
