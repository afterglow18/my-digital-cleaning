#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Register the Swift VisionPlugin class with the Capacitor ObjC bridge.
CAP_PLUGIN(VisionPlugin, "VisionPlugin",
    CAP_PLUGIN_METHOD(analyzeImage, CAPPluginReturnPromise);
)
