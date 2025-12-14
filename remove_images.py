import json

# Read the restaurants.json file
with open('restaurants.json', 'r', encoding='utf-8') as f:
    restaurants = json.load(f)

# Remove all images - cleanest solution until custom images are available
for restaurant in restaurants:
    # Remove restaurant_images field
    if 'restaurant_images' in restaurant:
        del restaurant['restaurant_images']
    
    # Remove image field from menu items
    for item in restaurant.get('menu_highlights', []):
        if 'image' in item:
            del item['image']

# Write the updated JSON back to file
with open('restaurants.json', 'w', encoding='utf-8') as f:
    json.dump(restaurants, f, indent=4, ensure_ascii=False)

print(f"✅ Successfully removed images from {len(restaurants)} restaurants!")
print(f"✅ Total menu items cleaned: {sum(len(r.get('menu_highlights', [])) for r in restaurants)}")
print(f"\n💡 Recommendation:")
print(f"   - Add your own custom images later")
print(f"   - Or use a paid service like Unsplash API")
print(f"   - Or manually curate images for each restaurant")
