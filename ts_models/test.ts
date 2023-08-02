@GoModel({
    generateTags: ['json', 'bson']
})
class Test{
    date1: Date
    date2: Date
    embed: {
        theInt: int
        theStr: string
    }
}