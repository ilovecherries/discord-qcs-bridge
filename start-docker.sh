sudo docker run -d \
    --mount source=discord-qcs-bridge-volume,target=/save \
    --env-file .env \
    discord-qcs-bridge