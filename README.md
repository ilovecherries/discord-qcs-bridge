# Discord-ContentAPI Bridge (for QCS)
## Docker Usage Instructions
### .env file
```
# don't change the save location if you're using docker
DB=file:/save/save.db
DISCORD_TOKEN=FILLMEIN
QCS_API=FILLMEIN.com
QCS_USERNAME=FILLMEIN
QCS_PASSWORD=FILLMEIN
```

### Running
```shell
./prepare-docker.sh
./build-docker.sh
./start-docker.sh
```

## Development Setup
- `npm install`
- you're done.
