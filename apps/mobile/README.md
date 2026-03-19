# BookDock Mobile (PWA)

BookDock mobile app is currently implemented as a Progressive Web App (PWA). 

## PWA Features

- Offline support with service worker
- Add to home screen
- Push notifications (optional)
- Responsive design for mobile devices

## Accessing the Mobile App

The web app at `apps/web` is fully responsive and works on mobile devices. 
Simply access it through a mobile browser or add it to your home screen.

## Future Plans

- React Native implementation for native mobile app
- Better offline support with IndexedDB
- Background sync
- Native notifications

## PWA Setup

To install the PWA:
1. Visit the web app on your mobile device
2. Tap "Add to Home Screen" in your browser menu
3. The app will be available as a standalone app

## Development

For mobile PWA development:

```bash
cd apps/web
pnpm dev
```

The app will automatically adapt to mobile screen sizes.
