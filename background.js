const MENU_ITEM_ID = 'swap-left-right';
const MEMORY_INITIAL_ATTRIBUTE_NAME = 'swaplrInitialSrc';
const MEMORY_SWAPPED_ATTRIBUTE_NAME = 'swaplrSwappedSrc';
const PENDING_ATTRIBUTE_NAME = 'swaplrPending';
const ANIMATION_TRANSFORMATION = 'translateY';
const ANIMATION_DURATION_MS = 150;

browser.contextMenus.onClicked.addListener(async (data, tab) => {
  if (data.menuItemId === MENU_ITEM_ID && typeof data.srcUrl === 'string') {
    browser.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (imgSrc, MEMORY_INITIAL_ATTRIBUTE_NAME, MEMORY_SWAPPED_ATTRIBUTE_NAME, PENDING_ATTRIBUTE_NAME, ANIMATION_TRANSFORMATION, ANIMATION_DURATION_MS) => {
        const errorAlert = () => window.alert('Unable to swap on this image');

        const blobSrcStart = `blob:${window.location.origin}`;
        const img = Array.from(document.querySelectorAll(`img[src="${CSS.escape(imgSrc)}"]`)).slice(-1)[0];
        if (!img || (img.src.startsWith(blobSrcStart) && !(MEMORY_SWAPPED_ATTRIBUTE_NAME in img.dataset))) {
          return errorAlert();
        }

        if (img.src.startsWith(blobSrcStart) && MEMORY_INITIAL_ATTRIBUTE_NAME in img.dataset) {
          img.src = img.dataset[MEMORY_INITIAL_ATTRIBUTE_NAME];
        } else {
          const swapped = img.dataset[MEMORY_SWAPPED_ATTRIBUTE_NAME];
          if (img.dataset[MEMORY_INITIAL_ATTRIBUTE_NAME] === img.src && swapped?.startsWith(blobSrcStart)) {
            img.src = swapped;
          } else if (!(PENDING_ATTRIBUTE_NAME in img.dataset)) {
            img.dataset[PENDING_ATTRIBUTE_NAME] = '';

            const drawSwappedImage = async (imgToDraw, deferrer = Promise.resolve()) => {
              const { naturalWidth: width, naturalHeight: height } = img;
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;

              const context = canvas.getContext('2d');

              context.drawImage(imgToDraw, -(width / 2), 0, width, height);
              context.drawImage(imgToDraw, width / 2, 0, width, height);

              const [ url ] = await Promise.all([
                new Promise((resolve, reject) => canvas.toBlob(blob => {
                  const registry = (window.__swaplrRegistry ??= new FinalizationRegistry(
                    (url) => URL.revokeObjectURL(url)
                  ));

                  try {
                    const url = URL.createObjectURL(blob);
                    registry.register(img, url);
                    resolve(url);
                  } catch (e) {
                    reject(e);
                  }
                })),
                deferrer,
              ]);
              img.dataset[MEMORY_INITIAL_ATTRIBUTE_NAME] = img.src;
              img.dataset[MEMORY_SWAPPED_ATTRIBUTE_NAME] = url;
              img.src = url;
              delete img.dataset[PENDING_ATTRIBUTE_NAME];
            };

            drawSwappedImage(img).catch(() => {
              const onError = e => {
                errorAlert();
                delete img.dataset[PENDING_ATTRIBUTE_NAME];
                console.error(e);
              }
              const animate = revert => img.animate([
                { transform: `${ANIMATION_TRANSFORMATION}(0)` },
                { transform: `${ANIMATION_TRANSFORMATION}(${revert ? '-' : ''}100%)` },
              ], { duration: ANIMATION_DURATION_MS, easing: 'ease-in', direction: revert ? 'reverse' : 'normal', fill: revert ? 'both' : 'forwards' });
              const animation = animate();
              const proxyImg = new Image();
              proxyImg.crossOrigin = 'anonymous';

              proxyImg.addEventListener('error', e => {
                animation.cancel();
                onError(e);
              });
              proxyImg.addEventListener('load', () => drawSwappedImage(proxyImg, animation.finished)
                .catch(onError)
                .then(() => {
                  const revert = animate(true);
                  revert.finished.then(() => {
                    animation.cancel();
                    revert.cancel();
                  });
                })
              );

              proxyImg.src = imgSrc;
            });
          }
        }
      },
      args: [ data.srcUrl, MEMORY_INITIAL_ATTRIBUTE_NAME, MEMORY_SWAPPED_ATTRIBUTE_NAME, PENDING_ATTRIBUTE_NAME, ANIMATION_TRANSFORMATION, ANIMATION_DURATION_MS ],
    });
  }
});

browser.runtime.onInstalled.addListener(async () => {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    contexts: [ 'image' ],
    documentUrlPatterns: [ '*://www.facebook.com/*' ],
    title: 'Swap left-right',
    id: MENU_ITEM_ID,
  });
});