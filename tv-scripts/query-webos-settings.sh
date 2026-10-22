#!/bin/sh

SERVICE=luna://com.webos.settingsservice/getSystemSettings

query() {
    category=$1
    key=$2
    printf '%s/%s: ' "$category" "$key"
    luna-send -n 1 "$SERVICE" "{\"category\":\"$category\",\"keys\":[\"$key\"]}"
}

query general homePromotion
query general sportsAlarm
query option livePromotion
query option webOSPromotionVideo
query option promotionStreamer
query option livePlus
query other contentRecommendation
