---
pub: true
---

Key helps you explore python objects quickly, especially in an interpreter.

It's a library I wrote for our python database shell at [work](https://www.welkinhealth.com)
and recently managed to clean it up and [release it](https://pypi.python.org/pypi/key).

``` bash
pip install key
```

Since it's built for the interpreter, I've tried hard to make it as few keystrokes
as possible to get useful stuff done.

So to get started:

``` python
import k
```

The k module you've just imported is actually an object 😲 ! Don't worry, [Guido says it's fine](https://mail.python.org/pipermail/python-ideas/2012-May/014969.html).

And it's a pretty "magic" object at that. So accessing any attribute `foo` of `k` will
return a "foo getter". You can think of it as a try-hard version of `operator.itemgetter('foo')`.

``` python
k.foo(obj)  # equivalent to obj.foo
```

Almost equivalent anyway. It'll swallow any AttributeErrors and return None instead, so it's a "safe" getter in that sense. But still not very useful. So you can chain it!

``` python
k.foo.bar(obj)  # obj.foo.bar
```

Now we're getting somewhere! Without k, if you wanted "safe" behavior, you'd have to do something like..

``` python
if hasattr(obj, 'foo') and hasattr(obj.foo, 'bar'):
  return obj.foo.bar
```

No fun. Again, this is relevant especially in a database shell—object relationships may come back `None`, and it's common to access deeply nested relationships. It's also common to project over lists (this was actually the original motivating use case).

``` python
k.foo(objects)  #  equivalent to [obj.foo for obj in objs]
k.foo.bar(objects)  #  equivalent to [obj.foo.bar for obj in objs]
```

More useful. But it's also common to want to view a few fields of a list of objects, so you can combine getters with `+`.

``` python
(k.first_name + k.last_name)(users)  
# [{'first_name':.., 'last_name':..},..]
```

and of course, these work together nicely, so:

``` python
(k.coach.first_name + k.first_name)(users)  
# [{"coach_first_name":.., "first_name":..},..]
```

If you don't want `None` as your default, you can provide another:

``` python
k.foo(obj, default="HI")
```

It will work with object attributes just the same as dictionary keys, too.

``` python
k.some.nested.json.value(json)  # json["some"]["nested"]..
```

If you have lists of lists, you can flatten them:

``` python
k.messages(users)  
# [[message1, message2..], [message3, message4..]..]
k.messages(users, flatten=True)  
#  [message1, message2, message3, message4]
k.messages(flatten=True).created_at(users)  
# [date1, date2, date3, date4]
```

Now we're getting somewhere!

Sometimes it's useful to return yourself, or print every attribute you have:

``` python
k._(obj) #  obj
k.__(obj) #  obj.__dict__
```

Anyway, check it out! It was fun to write, and I use it almost every day at work. Let me know if you find it useful, too.