# Naming Convention
Since I didn't create this file in the begining, there may some inconsistent
name style in the variable or filename. If you catch it and have time, please 
rename to the convention described in this doc. <br/>
If you have different opnion about the convention, please have discussion with
the member in the backend team. If you have reach consensus, please update this
doc for future reference. <br/>

- try to use `camelCase` for the name of 
    - variable.
    - file name.
    - collection name in the firestore.
- use hyphen(`-`) in the 
    - branch name.
    - in the collection name template with difference in the tagID, e.g. `status-{tagId}`
- `tag`: related to POI, point on the map
- `id`:
    - in the schema: `id`
    - in the variable name and not the first word: `...Id`