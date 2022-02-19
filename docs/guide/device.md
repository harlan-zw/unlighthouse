# Change Scan Device

Unlighthouse uses the [lighthouse node module](https://github.com/GoogleChrome/lighthouse) to perform scans.

By default, Unlighthouse will uses the default lighthouse configuration, which emulates a mobile device. Unlighthouse 
does _not throttle_ by default.

The device dimensions details are:
- **width**: 375
- **height**: 667

Config alises are provided to modify the emulated device behaviour.

## Alias: Switching between mobile and desktop

By default, Unlighthouse will run the audit using an emulated mobile desktop.

To change it to desktop:

```ts
export default {
  scanner: {
    device: 'desktop',
  }
}
```


To change it to mobile (default):

```ts
export default {
  scanner: {
    device: 'mobile',
  }
}
```

Note: This is an alias for setting the option yourself manually via `lighthouseOptions`.

## Change device dimensions

Changing the device dimensions can be useful if you want to test content that is only shown as specific dimensions.

```ts
export default {
  lighthouseOptions: {
    screenEmulation: {
      width: 1800,
      height: 1000,
    }
  }
}
```

## Alias: Enable/Disable Throttling

There are two types of throttling: CPU and network. Both are used in combination to emulate vistors to your site who
have poor internet connection and slow devices.

Unlighthouse will by default, throttle request to production sites for a more accurate performance score.

In development, it makes less sense to throttle as the network and CPU conditions for local development servers will
skew the results.

If you would like to modify the throttling for each environment you can do:

```ts
export default {
  scanner: {
    throttle: true
  }
}
```

Note: `throttle` is an alias for modifying `lighthouseOptions.throttlingMethod` and `lighthouseOptions.throttling`.
